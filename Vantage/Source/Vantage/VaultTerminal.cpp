#include "VaultTerminal.h"

#include "VantageGameMode.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const FLinearColor DormantColor(0.75f, 0.35f, 0.06f);
	const FLinearColor ActiveColor(0.12f, 1.f, 0.55f);
}

AVaultTerminal::AVaultTerminal()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));

	Plinth = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Plinth"));
	Plinth->SetupAttachment(Pivot);
	Plinth->SetRelativeLocation(FVector(0.f, 0.f, 55.f));
	Plinth->SetRelativeScale3D(FVector(1.1f, 1.6f, 1.1f));
	Plinth->SetCollisionProfileName(TEXT("BlockAll"));

	Core = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Core"));
	Core->SetupAttachment(Pivot);
	Core->SetRelativeLocation(FVector(0.f, 0.f, 175.f));
	Core->SetRelativeScale3D(FVector(0.5f, 0.5f, 0.5f));
	Core->SetCollisionProfileName(TEXT("BlockAll"));

	if (CubeFinder.Succeeded())
	{
		Plinth->SetStaticMesh(CubeFinder.Object);
		Core->SetStaticMesh(CubeFinder.Object);
	}

	CoreLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("CoreLight"));
	CoreLight->SetupAttachment(Pivot);
	CoreLight->SetRelativeLocation(FVector(0.f, 0.f, 175.f));
	CoreLight->IntensityUnits = ELightUnits::Unitless;
	CoreLight->Intensity = 6000.f;
	CoreLight->AttenuationRadius = 1200.f;
	CoreLight->CastShadows = false;
}

void AVaultTerminal::BeginPlay()
{
	Super::BeginPlay();

	if (UMaterialInstanceDynamic* PlinthMaterial = Plinth->CreateAndSetMaterialInstanceDynamic(0))
	{
		PlinthMaterial->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.14f, 0.15f, 0.18f));
	}

	CoreMaterial = Core->CreateAndSetMaterialInstanceDynamic(0);
	if (CoreMaterial)
	{
		CoreMaterial->SetVectorParameterValue(TEXT("Color"), DormantColor);
	}
	CoreLight->SetLightColor(DormantColor);
}

void AVaultTerminal::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Phase += DeltaSeconds;
	Core->AddLocalRotation(FRotator(0.f, bActivated ? 160.f * DeltaSeconds : 30.f * DeltaSeconds, 0.f));

	// Slow breathing pulse while dormant, urgent flicker once taken.
	const float Rate = bActivated ? 7.f : 1.4f;
	const float Depth = bActivated ? 0.45f : 0.2f;
	CoreLight->SetIntensity(6000.f * (1.f + FMath::Sin(Phase * Rate) * Depth));
}

FText AVaultTerminal::GetInteractionPrompt() const
{
	return bActivated
		? FText::FromString(TEXT("Core extracted"))
		: FText::FromString(TEXT("[E]  Extract vault core"));
}

void AVaultTerminal::Interact(AVantageCharacter* Interactor)
{
	if (bActivated)
	{
		return;
	}

	bActivated = true;

	if (CoreMaterial)
	{
		CoreMaterial->SetVectorParameterValue(TEXT("Color"), ActiveColor);
	}
	CoreLight->SetLightColor(ActiveColor);

	if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		GameMode->CompleteDemo();
	}
}
