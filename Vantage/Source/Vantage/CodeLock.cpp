#include "CodeLock.h"

#include "VantageGameMode.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;
	constexpr int32 DigitCount = 4;

	const FLinearColor HousingColour(0.155f, 0.160f, 0.180f);
	const FLinearColor LockedColour (0.95f, 0.25f, 0.12f);
	const FLinearColor OpenColour   (0.15f, 0.95f, 0.55f);
}

ACodeLock::ACodeLock()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

	auto MakePart = [&](const TCHAR* Name, UStaticMesh* Mesh, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Part->SetupAttachment(Pivot);
		Part->SetRelativeLocation(Location);
		Part->SetRelativeRotation(Rotation);
		Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);
		Part->SetCollisionProfileName(TEXT("BlockAll"));
		if (Mesh)
		{
			Part->SetStaticMesh(Mesh);
		}
		return Part;
	};

	UStaticMesh* Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
	UStaticMesh* Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;

	// A console on a stalk, facing back down the room toward the stairs.
	Housing = MakePart(TEXT("Housing"), Cube, FVector(0.f, 0.f, 60.f), FVector(22.f, 46.f, 60.f), FRotator::ZeroRotator);
	Face = MakePart(TEXT("Face"), Cube, FVector(-23.f, 0.f, 92.f), FVector(4.f, 36.f, 22.f), FRotator(-18.f, 0.f, 0.f));
	Bolt = MakePart(TEXT("Bolt"), Cylinder, FVector(0.f, 0.f, 128.f), FVector(9.f, 9.f, 26.f), FRotator(0.f, 0.f, 90.f));

	Indicator = CreateDefaultSubobject<UPointLightComponent>(TEXT("Indicator"));
	Indicator->SetupAttachment(Pivot);
	Indicator->SetRelativeLocation(FVector(-40.f, 0.f, 96.f));
	Indicator->IntensityUnits = ELightUnits::Unitless;
	Indicator->Intensity = 2600.f;
	Indicator->AttenuationRadius = 700.f;
	Indicator->CastShadows = false;

	Entered.Init(0, DigitCount);
}

void ACodeLock::BeginPlay()
{
	Super::BeginPlay();

	auto Tint = [](UStaticMeshComponent* Part, const FLinearColor& Colour) -> UMaterialInstanceDynamic*
	{
		if (!Part)
		{
			return nullptr;
		}
		UMaterialInstanceDynamic* Material = Part->CreateAndSetMaterialInstanceDynamic(0);
		if (Material)
		{
			Material->SetVectorParameterValue(TEXT("Color"), Colour);
		}
		return Material;
	};

	Tint(Housing, HousingColour);
	Tint(Bolt, FLinearColor(0.34f, 0.35f, 0.38f));
	FaceMaterial = Tint(Face, LockedColour);

	Indicator->SetLightColor(LockedColour);

	if (Entered.Num() != DigitCount)
	{
		Entered.Init(0, DigitCount);
	}
}

void ACodeLock::SetCombination(const TArray<int32>& InCombination)
{
	Combination = InCombination;
	Entered.Init(0, FMath::Max(Combination.Num(), DigitCount));
	Cursor = 0;
}

void ACodeLock::Engage()
{
	if (bOpen)
	{
		return;
	}
	bEngaged = true;
	Cursor = 0;
}

void ACodeLock::Disengage()
{
	bEngaged = false;
}

void ACodeLock::NudgeDigit(int32 Delta)
{
	if (!bEngaged || bOpen || !Entered.IsValidIndex(Cursor))
	{
		return;
	}

	// Wraps both ways, so spinning past nine comes back round to zero.
	Entered[Cursor] = ((Entered[Cursor] + Delta) % 10 + 10) % 10;
}

void ACodeLock::MoveCursor(int32 Delta)
{
	if (!bEngaged || bOpen || Entered.Num() == 0)
	{
		return;
	}

	Cursor = ((Cursor + Delta) % Entered.Num() + Entered.Num()) % Entered.Num();
}

bool ACodeLock::Submit()
{
	if (!bEngaged || bOpen)
	{
		return false;
	}

	if (Combination.Num() == 0 || Entered != Combination)
	{
		RejectFlash = 1.f;
		return false;
	}

	bOpen = true;
	bEngaged = false;

	if (FaceMaterial)
	{
		FaceMaterial->SetVectorParameterValue(TEXT("Color"), OpenColour);
	}
	Indicator->SetLightColor(OpenColour);

	if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		GameMode->NotifyLockOpened();
	}

	return true;
}

void ACodeLock::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	RejectFlash = FMath::Max(RejectFlash - DeltaSeconds * 1.8f, 0.f);

	// Bolt withdraws into the housing once it opens.
	const float TargetSlide = bOpen ? 1.f : 0.f;
	BoltSlide = FMath::FInterpTo(BoltSlide, TargetSlide, DeltaSeconds, 3.f);
	if (Bolt)
	{
		Bolt->SetRelativeLocation(FVector(0.f, BoltSlide * 34.f, 128.f));
	}

	// Slow pulse while locked, steady once open, hard red on a rejection.
	const float Pulse = bOpen ? 1.f : (1.f + FMath::Sin(GetWorld()->GetTimeSeconds() * 2.4f) * 0.25f);
	Indicator->SetIntensity(2600.f * Pulse * (1.f + RejectFlash * 2.f));
}
