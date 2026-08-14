#include "Revolver.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;

	const FLinearColor GunmetalColour(0.085f, 0.090f, 0.100f);
	const FLinearColor SteelColour   (0.310f, 0.325f, 0.350f);
	const FLinearColor WoodColour    (0.230f, 0.115f, 0.055f);

	/** Cylinders model along local Z, so lying one down +X is a 90 degree pitch. */
	const FRotator AlongX(90.f, 0.f, 0.f);
}

ARevolver::ARevolver()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

	UStaticMesh* Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
	UStaticMesh* Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;

	// Frame and topstrap.
	Frame = AddPart(TEXT("Frame"), Cube, FVector(2.f, 0.f, 0.f), FVector(7.f, 1.8f, 3.2f), FRotator::ZeroRotator);

	// Fluted cylinder, sitting proud of the frame. Spins during a reload.
	Chamber = AddPart(TEXT("Chamber"), Cylinder, FVector(1.5f, 0.f, 0.2f), FVector(3.1f, 3.1f, 3.6f), AlongX);

	Barrel = AddPart(TEXT("Barrel"), Cylinder, FVector(14.f, 0.f, 0.6f), FVector(1.6f, 1.6f, 8.f), AlongX);
	Rib = AddPart(TEXT("Rib"), Cube, FVector(14.f, 0.f, 2.9f), FVector(8.f, 0.7f, 0.8f), FRotator::ZeroRotator);
	FrontSight = AddPart(TEXT("FrontSight"), Cube, FVector(21.f, 0.f, 4.1f), FVector(0.6f, 0.5f, 1.2f), FRotator::ZeroRotator);

	// Grip rakes back and down, the way a single action does.
	Grip = AddPart(TEXT("Grip"), Cube, FVector(-6.5f, 0.f, -6.5f), FVector(3.f, 1.9f, 6.5f), FRotator(-22.f, 0.f, 0.f));

	Hammer = AddPart(TEXT("Hammer"), Cube, FVector(-6.2f, 0.f, 3.2f), FVector(1.4f, 0.8f, 2.f), FRotator(-14.f, 0.f, 0.f));
	TriggerGuard = AddPart(TEXT("TriggerGuard"), Cube, FVector(-2.2f, 0.f, -3.4f), FVector(2.6f, 1.f, 0.5f), FRotator::ZeroRotator);


	Muzzle = CreateDefaultSubobject<USceneComponent>(TEXT("Muzzle"));
	Muzzle->SetupAttachment(Pivot);
	Muzzle->SetRelativeLocation(FVector(23.f, 0.f, 0.6f));

	MuzzleFlash = CreateDefaultSubobject<UPointLightComponent>(TEXT("MuzzleFlash"));
	MuzzleFlash->SetupAttachment(Muzzle);
	MuzzleFlash->IntensityUnits = ELightUnits::Unitless;
	MuzzleFlash->Intensity = 0.f;
	MuzzleFlash->AttenuationRadius = 900.f;
	MuzzleFlash->LightColor = FColor(255, 214, 140);
	MuzzleFlash->CastShadows = false;
}

UStaticMeshComponent* ARevolver::AddPart(const TCHAR* Name, UStaticMesh* Mesh, const FVector& Location, const FVector& Scale, const FRotator& Rotation)
{
	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(Pivot);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(Scale / MeshHalfSize);
	Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	// The gun sits centimetres from the near plane; letting it cast shadows
	// produces nothing but artefacts across the whole view.
	Part->SetCastShadow(false);

	if (Mesh)
	{
		Part->SetStaticMesh(Mesh);
	}
	return Part;
}

void ARevolver::BeginPlay()
{
	Super::BeginPlay();

	RestLocation = Pivot->GetRelativeLocation();
	Ammo = Capacity;

	auto Tint = [](UStaticMeshComponent* Part, const FLinearColor& Colour)
	{
		if (!Part)
		{
			return;
		}
		if (UMaterialInstanceDynamic* Material = Part->CreateAndSetMaterialInstanceDynamic(0))
		{
			Material->SetVectorParameterValue(TEXT("Color"), Colour);
		}
	};

	Tint(Frame, GunmetalColour);
	Tint(Barrel, GunmetalColour);
	Tint(Rib, GunmetalColour);
	Tint(Hammer, SteelColour);
	Tint(TriggerGuard, GunmetalColour);
	Tint(FrontSight, SteelColour);
	Tint(Chamber, SteelColour);
	Tint(Grip, WoodColour);
}

bool ARevolver::Fire()
{
	if (bReloading || Ammo <= 0)
	{
		return false;
	}

	--Ammo;
	Recoil = 1.f;
	FlashTimer = 0.045f;

	// Advance the cylinder one chamber per shot.
	if (Chamber)
	{
		Chamber->AddLocalRotation(FRotator(0.f, 0.f, 360.f / FMath::Max(Capacity, 1)));
	}

	return true;
}

void ARevolver::BeginReload()
{
	if (bReloading || Ammo >= Capacity)
	{
		return;
	}

	bReloading = true;
	ReloadElapsed = 0.f;
}

float ARevolver::GetReloadProgress() const
{
	if (!bReloading)
	{
		return 0.f;
	}
	return FMath::Clamp(ReloadElapsed / FMath::Max(ReloadSeconds, KINDA_SMALL_NUMBER), 0.f, 1.f);
}

FVector ARevolver::GetMuzzleLocation() const
{
	return Muzzle ? Muzzle->GetComponentLocation() : GetActorLocation();
}

void ARevolver::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Muzzle flash: a hard on, then straight off. Anything smoother reads as a
	// lamp rather than a discharge.
	if (FlashTimer > 0.f)
	{
		FlashTimer -= DeltaSeconds;
		MuzzleFlash->SetIntensity(FlashTimer > 0.f ? 260000.f : 0.f);
	}

	if (Recoil > 0.f)
	{
		Recoil = FMath::Max(Recoil - DeltaSeconds * 5.5f, 0.f);
	}

	if (bReloading)
	{
		ReloadElapsed += DeltaSeconds;

		if (Chamber)
		{
			Chamber->AddLocalRotation(FRotator(0.f, 0.f, 420.f * DeltaSeconds));
		}

		if (ReloadElapsed >= ReloadSeconds)
		{
			bReloading = false;
			ReloadElapsed = 0.f;
			Ammo = Capacity;
		}
	}

	// Kick straight back and up on recoil; dip and roll out of view on reload.
	const float ReloadDip = bReloading ? FMath::Sin(GetReloadProgress() * PI) : 0.f;

	const FVector Offset(
		-4.2f * Recoil,
		0.f,
		1.1f * Recoil - 7.5f * ReloadDip);

	Pivot->SetRelativeLocation(RestLocation + Offset);
	Pivot->SetRelativeRotation(FRotator(
		9.f * Recoil - 26.f * ReloadDip,
		0.f,
		-18.f * ReloadDip));
}
