#include "ObjectiveCache.h"

#include "VantageCharacter.h"
#include "VantageGameMode.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;
	const FLinearColor CoreColour(0.15f, 0.95f, 0.70f);
	const FLinearColor CaseColour(0.16f, 0.17f, 0.19f);
	const FLinearColor PlinthColour(0.22f, 0.20f, 0.17f);
}

AObjectiveCache::AObjectiveCache()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));

	auto MakePart = [&](const TCHAR* Name, UStaticMesh* Mesh, const FVector& Location, const FVector& HalfExtent) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Part->SetupAttachment(Pivot);
		Part->SetRelativeLocation(Location);
		Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);
		Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		if (Mesh)
		{
			Part->SetStaticMesh(Mesh);
		}
		return Part;
	};

	UStaticMesh* Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
	UStaticMesh* Sphere = SphereFinder.Succeeded() ? SphereFinder.Object : nullptr;

	Plinth = MakePart(TEXT("Plinth"), Cube, FVector(0.f, 0.f, 26.f), FVector(46.f, 46.f, 26.f));
	Case = MakePart(TEXT("Case"), Cube, FVector(0.f, 0.f, 70.f), FVector(30.f, 20.f, 18.f));
	Core = MakePart(TEXT("Core"), Sphere, FVector(0.f, 0.f, 108.f), FVector(13.f, 13.f, 13.f));

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Pivot);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, 108.f));
	Glow->IntensityUnits = ELightUnits::Unitless;
	Glow->Intensity = 9000.f;
	Glow->AttenuationRadius = 1400.f;
	Glow->CastShadows = false;
}

void AObjectiveCache::BeginPlay()
{
	Super::BeginPlay();

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

	Tint(Plinth, PlinthColour);
	Tint(Case, CaseColour);
	Tint(Core, CoreColour);

	Glow->SetLightColor(CoreColour);
}

void AObjectiveCache::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (bTaken)
	{
		return;
	}

	Phase += DeltaSeconds;

	if (Core)
	{
		Core->AddLocalRotation(FRotator(0.f, 42.f * DeltaSeconds, 0.f));
		Core->SetRelativeLocation(FVector(0.f, 0.f, 108.f + FMath::Sin(Phase * 1.7f) * 6.f));
	}

	// Breathing pulse, so it is findable in a dark interior from the doorway.
	Glow->SetIntensity(9000.f * (1.f + FMath::Sin(Phase * 2.2f) * 0.22f));

	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	AVantageCharacter* Player = PC ? Cast<AVantageCharacter>(PC->GetPawn()) : nullptr;
	if (!Player || Player->IsDown())
	{
		return;
	}

	if (FVector::DistSquared(Player->GetActorLocation(), GetActorLocation()) > PickupRadius * PickupRadius)
	{
		return;
	}

	bTaken = true;

	if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		GameMode->NotifyCacheTaken();
	}

	Destroy();
}
